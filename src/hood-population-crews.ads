--  Crews (item 5): a gang's lieutenants, each with up to nine men, as
--  1.2.91 keeps its teams (execution.ts promoteToLieutenant, disbandTeam;
--  api.ts moveToTeam, moveToPool), written fresh. A crew keeps 1.2.91's
--  number from the shared counter; people carry it in Team.
package Hood.Population.Crews with Preelaborate is

   function Slot_Of (S : Population_State; Id : Integer_32) return Integer_32;
   --  The crew slot with number Id, or No_Id.

   function Crew_Of (S : Population_State; Person : Integer_32) return Integer_32 is
     (Slot_Of (S, S.People (Person).Team));
   --  The slot of the crew the person is in (as lieutenant or member).

   function In_Pool (S : Population_State; G : Gang_Id; Person : Integer_32) return Boolean;

   procedure New_Crew
     (S : in out Population_State; G : Gang_Id; Lieutenant : Integer_32;
      Slot : out Integer_32);
   --  A crew for Lieutenant with the next number; No_Id when the gang has
   --  twelve or every slot is taken. Makes him a lieutenant (Kind) and takes
   --  him out of the pool and any other crew; his pay is the caller's.

   procedure Add_Member (S : in out Population_State; Slot, Person : Integer_32)
     with Pre => S.Crews (Slot).Count < Max_Crew_Members;
   procedure Remove_Member (S : in out Population_State; Slot, Person : Integer_32);
   procedure Join_Pool (S : in out Population_State; G : Gang_Id; Person : Integer_32);
   procedure Leave_Pool (S : in out Population_State; G : Gang_Id; Person : Integer_32);

   procedure Leave_Everything (S : in out Population_State; G : Gang_Id; Person : Integer_32);
   --  Out of every crew of G (not as lieutenant) and the pool.

   procedure Disband
     (S : in out Population_State; Slot : Integer_32; Keep_Lieutenant : Boolean);
   --  disbandTeam: the orders go, the men and the kit go back to the gang;
   --  the lieutenant joins the pool as a hood when kept.

   function First_Crew (S : Population_State; G : Gang_Id) return Integer_32 is
     (if S.Gangs (G).Crew_Total > 0 then S.Gangs (G).Crews (1) else No_Id);

end Hood.Population.Crews;
